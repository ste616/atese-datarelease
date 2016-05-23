#!/usr/bin/perl

use CGI qw(:standard);
use JSON;
use Astro::Time;
use strict;

# Compile all the data for the specified sources and return a JSON structure for them.
# This version should run as a CGI script on the webserver.

# CGI.
my $in = CGI->new;
my %input = $in->Vars;

# The base directory to find the data in.
my $od = "/var/www/astrowebservices.com/public_html/C2914/datarelease/datarelease";

# The list of sources should be a JSON array in the parameter "sources".
my $sources = from_json $input{"sources"};

my $mode = "json";
# We can output Mark-formatted data if the user passes the option "mwformat" as "mode".
if ($input{"mode"} && $input{"mode"} eq "mwformat") {
    $mode = "mwformat";
}

#print "Reading catalogue...\n";
my $catalogue;
my $catname = $od."/datarelease_catalogue.json";

if (-e $catname) {
    open(C, $catname);
    my $cattxt = <C>;
    close(C);
    $catalogue = from_json $cattxt;
} else {
    die "Can't open file $catname\n";
}

my $outh = {};

for (my $i = 0; $i <= $#{$sources}; $i++) {
    if (exists $catalogue->{$sources->[$i]}) {
	$outh->{$sources->[$i]} = $catalogue->{$sources->[$i]};
	$outh->{$sources->[$i]}->{'data'} = [];
	# Grab the full data.
	for (my $j = 0; $j <= $#{$catalogue->{$sources->[$i]}->{'epochs'}}; $j++) {
	    my $ename = $catalogue->{$sources->[$i]}->{'epochs'}->[$j];
#	    print "  epoch ".$ename."\n";
	    my $efile = $od."/".$ename."/".$sources->[$i]."_".$ename.".json";
	    if (-e $efile) {
		open(D, $efile);
		my $datxt = <D>;
		close(D);
		push @{$outh->{$sources->[$i]}->{'data'}}, from_json $datxt;
	    }
	}
    }
}

# Output the data.
my $outbase = "/usr/lib/cgi-bin/c2914_outputs";
chomp(my $fdate = `date -u +%Y-%m-%d_%H:%M:%S`);
my $outfile = "data_extract_".$fdate;
if ($mode eq "json") {
    $outfile .= ".json";
    open(O, ">".$outbase."/".$outfile);
    print O to_json $outh;
    close(O);
} elsif ($mode eq "mwformat") {
    # We have to make a single tar file full of all the individual
    # source txt files.
    system "mkdir ".$outbase."/".$outfile;
    for (my $i = 0; $i <= $#{$sources}; $i++) {
	my $mref = $outh->{$sources->[$i]};
	my $tfile = $sources->[$i].".mwformat.txt";
	open(T, ">".$outbase."/".$outfile."/".$tfile);
	for (my $j = 0; $j <= $#{$mref->{'mjd'}}; $j++) {
	    my @a4;
	    my @f4;
	    my @a16;
	    my @f16;
	    my @tmjd = mjd2cal($mref->{'mjd'}->[$j]);
	    my $ts = sprintf "%4d-%02d-%02d %s", $tmjd[2], $tmjd[1], $tmjd[0], turn2str($tmjd[3], "H", 0, ":");
	    my $dref = $mref->{'data'}->[$j];
	    for (my $k = 0; $k <= $#{$mref->{'fluxDensityData'}}; $k++) {
		if ($mref->{'fluxDensityData'}->[$k]->{'stokes'} eq "I") {
		    my $fref = $mref->{'fluxDensityData'}->[$k];
		    for (my $l = 0; $l <= $#{$fref->{'data'}}; $l++) {
			if ($fref->{'data'}->[$l]->[0] > 3.5) {
			    push @a4, $fref->{'data'}->[$l]->[1];
			    push @f4, $fref->{'data'}->[$l]->[0];
			} else {
			    push @a16, $fref->{'data'}->[$l]->[1];
			    push @f16, $fref->{'data'}->[$l]->[0];
			}
		    }
		}
	    }
	    if ($#f4 >= 0) {
		print T $ts."  ".($#f4 + 1)."  ";
		print T join("  ", @f4);
		print T "  ";
		print T join("  ", @a4);
		print T "\n";
	    }
	    if ($#f16 >= 0) {
		print T $ts."  ".($#f16 + 1)."  ";
		print T join("  ", @f16);
		print T "  ";
		print T join("  ", @a16);
		print T "\n";
	    }
	}
	close(T);
    }
    # Tar up the directory.
    system "tar -C ".$outbase." -c -z -f ".$outbase."/".$outfile.".tar.gz ".$outfile;
    $outfile .= ".tar.gz";
}

# Return this file to the user.
print $in->header( -type => 'application/octet-stream' );
open( my $b, $outbase."/".$outfile );
binmode($b);
binmode(STDOUT);
my $buf_size = 4096;
my $buf;
while ( read($b, $buf, $buf_size) ) {
    print $buf;
}
close($b);

#print "Output created in file $outfile\n";

